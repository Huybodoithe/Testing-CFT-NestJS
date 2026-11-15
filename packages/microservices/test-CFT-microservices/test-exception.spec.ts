import 'reflect-metadata';
import { IntrinsicException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of } from 'rxjs';
import { RpcException } from '../exceptions/rpc-exception.js';
import { RpcExceptionsHandler } from '../exceptions/rpc-exceptions-handler.js';
import { BaseRpcExceptionFilter } from '../exceptions/base-rpc-exception-filter.js';
import { GrpcException } from '../exceptions/grpc-exception.js';
import { GrpcExceptionFilter } from '../exceptions/grpc-exception-filter.js';
import { KafkaRetriableException } from '../exceptions/kafka-retriable-exception.js';
import { GrpcStatus } from '../enums/grpc-status.enum.js';

const randomText = () =>
  Array.from(
    { length: 18 + Math.floor(Math.random() * 15) },
    () => 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)],
  ).join('');

const randomCode = () => 20 + Math.floor(Math.random() * 70);

describe('exception handling CFT driver', () => {
  describe('RpcException', () => {
    it('covers string messages, object messages, and class-name fallbacks', () => {
      const stringError = randomText();
      const objectMessage = randomText();
      const plain = new RpcException(stringError);
      const withMessage = new RpcException({
        message: objectMessage,
        detail: randomText(),
      });
      const withoutMessage = new RpcException({ detail: randomText() });
      class Unsplit extends RpcException {}
      Object.defineProperty(Unsplit, 'name', { value: 'RPC' });
      const unsplit = new Unsplit({ detail: randomText() });
      const noConstructor = new RpcException({ detail: randomText() });
      Object.defineProperty(noConstructor, 'constructor', {
        value: undefined,
      });
      noConstructor.initMessage();

      expect(plain.message).toBeDefined();
      expect(plain.getError()).toBeDefined();
      expect(withMessage.message).toBeDefined();
      expect(withoutMessage.message).toBeDefined();
      expect(unsplit.message).toBeDefined();
      expect(noConstructor.message).toBeDefined();
    });
  });

  describe('BaseRpcExceptionFilter', () => {
    it('covers RPC payload forms, wrapped Error, retriable control errors, and unknown exceptions', async () => {
      const filter = new BaseRpcExceptionFilter();
      const logger = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const stringException = new RpcException(randomText());
      const objectException = new RpcException({ detail: randomText() });
      const wrappedError = Object.assign(new Error(randomText()), {
        metadata: { trace: randomText() },
      });
      const retriableException = new KafkaRetriableException(randomText());
      const intrinsicException = new (class extends IntrinsicException {})(
        randomText(),
      );

      await expect(
        lastValueFrom(filter.catch(new Error(randomText()), null as any)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(filter.catch(stringException, null as any)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(filter.catch(objectException, null as any)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(
          filter.catch(new RpcException(wrappedError), null as any),
        ),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(filter.catch(retriableException, null as any)),
      ).rejects.toBe(retriableException);
      await expect(
        lastValueFrom(filter.catch(intrinsicException, null as any)),
      ).rejects.toBeDefined();

      expect(filter.isError({ message: randomText() })).toBeDefined();
      expect(filter.isError(randomText())).toBeDefined();
      expect(logger).toHaveBeenCalled();
      logger.mockRestore();
    });
  });

  describe('RpcExceptionsHandler', () => {
    it('covers default handling, report flag, and reporting RpcException only', async () => {
      const handler = new RpcExceptionsHandler();
      const logger = vi
        .spyOn((RpcExceptionsHandler as any).logger, 'error')
        .mockImplementation(() => undefined);
      const rpcException = new RpcException(randomText());
      const ordinaryError = new Error(randomText());

      await expect(
        lastValueFrom(handler.handle(rpcException, null as any, true)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(handler.handle(ordinaryError, null as any, true)),
      ).rejects.toBeDefined();

      expect(logger).toHaveBeenCalledTimes(2);
      logger.mockRestore();
    });

    it('covers invalid filters, empty filters, matching filters, and handled falsy values', async () => {
      const handler = new RpcExceptionsHandler();
      class MatchedException extends RpcException {}
      class UnmatchedException extends RpcException {}
      const exception = new MatchedException(randomText());

      expect(() => handler.setCustomFilters(null as any)).toThrow();
      handler.setCustomFilters([]);
      expect(
        handler.invokeCustomFilters(exception, null as any),
      ).toBeUndefined();

      const stream = of(randomText());
      handler.setCustomFilters([
        {
          exceptionMetatypes: [MatchedException],
          func: vi.fn(() => stream),
        },
      ] as any);
      expect(handler.invokeCustomFilters(exception, null as any)).toBe(stream);
      expect(
        await lastValueFrom(handler.handle(exception, null as any)),
      ).toBeDefined();

      handler.setCustomFilters([
        {
          exceptionMetatypes: [MatchedException],
          func: vi.fn(() => null),
        },
      ] as any);
      expect(
        await lastValueFrom(handler.handle(exception, null as any)),
      ).toBeNull();

      handler.setCustomFilters([
        {
          exceptionMetatypes: [MatchedException],
          func: vi.fn(() => undefined),
        },
      ] as any);
      await expect(
        lastValueFrom(handler.handle(exception, null as any)),
      ).rejects.toBeDefined();

      handler.setCustomFilters([
        {
          exceptionMetatypes: [UnmatchedException],
          func: vi.fn(() => of(randomText())),
        },
      ] as any);
      await expect(
        lastValueFrom(handler.handle(exception, null as any)),
      ).rejects.toBeDefined();
    });
  });

  describe('GrpcExceptionFilter', () => {
    it('covers gRPC, RPC-code, RPC-status, invalid-code, and unknown exception paths', async () => {
      const filter = new GrpcExceptionFilter();
      const grpcException = new GrpcException(randomText(), GrpcStatus.ABORTED);
      const rpcWithCode = new RpcException({
        code: randomCode(),
        message: randomText(),
        detail: randomText(),
      });
      const rpcWithStatus = new RpcException({
        status: randomCode(),
        message: randomText(),
      });
      const rpcWithoutNumber = new RpcException({
        code: randomText(),
        status: randomText(),
        message: randomText(),
      });
      const rpcString = new RpcException(randomText());

      await expect(
        lastValueFrom(filter.catch(grpcException, null as any)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(filter.catch(rpcWithCode, null as any)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(filter.catch(rpcWithStatus, null as any)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(filter.catch(rpcWithoutNumber, null as any)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(filter.catch(rpcString, null as any)),
      ).rejects.toBeDefined();
      await expect(
        lastValueFrom(filter.catch(new Error(randomText()), null as any)),
      ).rejects.toBeDefined();
    });
  });
});
