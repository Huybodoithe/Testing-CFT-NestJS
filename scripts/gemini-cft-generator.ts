import { Project, SyntaxKind, SourceFile } from 'ts-morph';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Lỗi: Chưa cấu hình GEMINI_API_KEY trong file .env!');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });

// Thư mục chứa toàn bộ test sinh ra
const OUTPUT_ROOT_DIR = path.resolve(process.cwd(), 'test-cft-project');

const SYSTEM_PROMPT = `
Bạn là một chuyên gia kiểm thử phần mềm tự động theo phương pháp Control Flow Testing (CFT).
Nhiệm vụ: Sinh mã nguồn Unit Test (sử dụng Vitest) cho file TypeScript được cung cấp.

BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT 4 ĐIỀU KIỆN SAU:
1. Đạt Branch Coverage cao:
   - Phân tích tất cả các nhánh điều khiển (if, else, switch, case, toán tử 3 ngôi ? :, &&, ||, vòng lặp, catch).
   - Viết các test case (it/test) đi qua toàn bộ các nhánh True và False của từng điều kiện.
2. Input sinh ngẫu nhiên (KHÔNG DÙNG GIÁ TRỊ BIÊN):
   - Giá trị đầu vào của biến phải được chọn ngẫu nhiên nằm sâu trong miền hợp lệ của nhánh đó.
   - TUYỆT ĐỐI KHÔNG dùng giá trị biên (như 0, 1, -1, "", []) TRỪ KHI điều kiện nhánh bắt buộc so sánh bằng chính xác với giá trị đó (ví dụ: if (x === 0) hoặc if (!str)).
   - Ví dụ: với điều kiện "count > 5", hãy chọn ngẫu nhiên count = 42 (không chọn 5 hay 6). Với chuỗi bất kỳ, truyền "random_str_8472".
3. Expected Output là giá trị mặc định (Chỉ cần test execute thành công):
   - Không cần tính toán kết quả thực tế. Khai báo một biến mặc định (ví dụ: const defaultExpected = null;) và BẮT BUỘC bọc lời gọi hàm cần test trong khối try/catch để nếu nhánh đó throw Exception thì test vẫn chạy tiếp không bị dừng.
   - Cuối mỗi khối it(), luôn dùng lệnh: expect(true).toBe(true); để test luôn PASS sau khi đã đi qua nhánh code.
4. Sử dụng Mock cho toàn bộ Dependency bên ngoài:
   - Dùng vi.mock(...) hoặc vi.fn() để giả lập tất cả các module, class, hoặc hàm bên ngoài được import vào file gốc.
   - Thiết lập giá trị trả về của mock (mockReturnValue / mockResolvedValue) khớp với điều kiện để kích hoạt đúng nhánh cần kiểm thử.

CHỈ TRẢ VỀ DUY NHẤT ĐOẠN CODE TYPESCRIPT NẰM TRONG BLOCK \`\`\`typescript ... \`\`\`, KHÔNG GIẢI THÍCH GÌ THÊM.
`;

// Kiểm tra xem file có chứa cấu trúc rẽ nhánh nào không
function hasControlFlowBranches(sourceFile: SourceFile): boolean {
  const branchKinds = [
    SyntaxKind.IfStatement,
    SyntaxKind.SwitchStatement,
    SyntaxKind.ConditionalExpression,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.DoStatement,
    SyntaxKind.CatchClause,
  ];
  return branchKinds.some(
    kind => sourceFile.getDescendantsOfKind(kind).length > 0,
  );
}

// Bóc tách code từ phản hồi Markdown của Gemini
function extractCodeBlock(text: string): string {
  const match = text.match(/```(?:typescript|ts)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runGeminiGenerator() {
  const project = new Project();

  // Quét các file mã nguồn chính, phớt lờ toàn bộ các file test có sẵn của NestJS
  const sourceFiles = project.addSourceFilesAtPaths([
    'packages/**/*.ts',
    '!packages/**/*.spec.ts',
    '!packages/**/*.test.ts',
    '!packages/**/*.d.ts',
    '!packages/**/index.ts',
    '!packages/**/interfaces/**',
    '!packages/**/constants.ts',
    '!packages/**/enums/**',
  ]);

  console.log(
    `Đã quét ${sourceFiles.length} file. Đang lọc các file có nhánh CFT...`,
  );

  for (const file of sourceFiles) {
    const sourceFilePath = file.getFilePath();

    if (!hasControlFlowBranches(file)) {
      continue; // Bỏ qua file không có rẽ nhánh
    }

    // Đường dẫn tương đối từ thư mục gốc (VD: packages/common/pipes/parse-int.pipe.ts)
    const relativeFromRoot = path.relative(process.cwd(), sourceFilePath);

    // Đường dẫn lưu file test trong thư mục test-cft-project
    const targetTestPath = path.join(
      OUTPUT_ROOT_DIR,
      relativeFromRoot.replace(/\.ts$/, '.cft.spec.ts'),
    );

    // Nếu file test đã được sinh trước đó thì bỏ qua (hữu ích khi chạy tiếp sau khi tạm dừng)
    if (fs.existsSync(targetTestPath)) {
      console.log(
        `[ĐÃ TỒN TẠI]: ${path.relative(process.cwd(), targetTestPath)}`,
      );
      continue;
    }

    const targetDir = path.dirname(targetTestPath);
    fs.mkdirSync(targetDir, { recursive: true });

    // Tính đường dẫn import tương đối từ file test trong test-cft-project về file gốc trong packages
    let relativeImportPath = path
      .relative(targetDir, sourceFilePath)
      .replace(/\\/g, '/') // Chuẩn hóa dấu gạch chéo trên Windows
      .replace(/\.ts$/, '');

    if (!relativeImportPath.startsWith('.')) {
      relativeImportPath = './' + relativeImportPath;
    }

    const sourceCode = file.getFullText();
    console.log(`[ĐANG SINH TEST]: ${relativeFromRoot}`);

    const fullPrompt = `
${SYSTEM_PROMPT}

LƯU Ý QUAN TRỌNG VỀ ĐƯỜNG DẪN IMPORT:
- File test này được lưu ở thư mục tách biệt so với file gốc.
- Để import các class/function từ file gốc cần test, BẮT BUỘC sử dụng chính xác đường dẫn: "${relativeImportPath}"
- Nếu cần dùng vi.mock() cho các dependency nội bộ (relative import) mà file gốc đang import, hãy tự động điều chỉnh đường dẫn tương ứng với thư mục của "${relativeImportPath}".
- Nhớ import { describe, it, expect, vi, beforeEach } from 'vitest'; ở đầu file.

Mã nguồn của file cần test (${relativeFromRoot}):
\`\`\`typescript
${sourceCode}
\`\`\`
`;

    let retries = 5; // Tăng lên 5 lần thử lại cho mỗi file
    while (retries > 0) {
      try {
        const result = await model.generateContent(fullPrompt);
        const rawText = result.response.text();
        const cleanTestCode = extractCodeBlock(rawText);

        fs.writeFileSync(targetTestPath, cleanTestCode, 'utf-8');
        console.log(
          ` -> Đã lưu: ${path.relative(process.cwd(), targetTestPath)}`,
        );

        // Nghỉ 5 giây giữa các file thành công
        await sleep(5000);
        break; // Thành công thì thoát vòng lặp retry để sang file tiếp theo
      } catch (err: any) {
        retries--;
        const errMsg = String(err.message || err);

        // Bắt tất cả các lỗi: 429 (Rate limit), 503 (Server quá tải), 500, hoặc fetch failed (rớt mạng/timeout)
        const isTransientError =
          err.status === 429 ||
          err.status === 503 ||
          err.status === 500 ||
          errMsg.includes('429') ||
          errMsg.includes('503') ||
          errMsg.includes('fetch failed') ||
          errMsg.includes('ECONNRESET');

        if (isTransientError && retries > 0) {
          // Đợi tăng dần: lần lỗi 1 đợi 15s, lần 2 đợi 30s, lần 3 đợi 45s...
          const waitTime = (5 - retries) * 15000;
          console.warn(
            ` -> [Tạm gián đoạn: ${errMsg.slice(0, 80)}...] Đợi ${waitTime / 1000}s rồi thử lại (Còn ${retries} lần)...`,
          );
          await sleep(waitTime);
        } else {
          console.error(
            ` -> [BỎ QUA FILE NÀY SAU NHIỀU LẦN LỖI] ${relativeFromRoot}:`,
            errMsg,
          );
          break;
        }
      }
    }
  }

  console.log('Hoàn tất quá trình sinh test CFT!');
}

runGeminiGenerator();
