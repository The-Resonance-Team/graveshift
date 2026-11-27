import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ThrottleKeyGenerator } from './throttle-key.generator';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [ThrottleKeyGenerator],
  exports: [ThrottleKeyGenerator, JwtModule],
})
export class ThrottleKeyModule {}
