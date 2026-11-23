import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';

import { createOpenApiDocument } from './openapi';

function isController(value: unknown): value is Type<unknown> {
  return typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value);
}

/** Read the real decorated routes without constructing their runtime dependencies. */
export async function createMetadataDocument() {
  const files = [...new Bun.Glob('**/*.controller.ts').scanSync(import.meta.dir)].sort();
  const modules = await Promise.all(files.map((path) => import(`./${path.slice(0, -3)}`)));
  const controllers = modules.flatMap((module) => Object.values(module)).filter(isController);
  if (controllers.length === 0) throw new Error('No controller metadata found');
  const moduleRef = await Test.createTestingModule({ controllers })
    .useMocker(() => Object.freeze({}))
    .compile({ preview: true });
  const app = moduleRef.createNestApplication({ logger: false });
  try {
    return createOpenApiDocument(app);
  } finally {
    await app.close();
  }
}
