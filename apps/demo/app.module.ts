import { Module } from '@nestjs/common';
import { FoundationModule } from '../../src/factory/index.js';
import { HealthModule } from '../../src/health/index.js';
import { HelloModule } from '../../src/modules/hello/index.js';
import { UserModule } from '../../src/modules/user/index.js';

/**
 * demo 宿主根模块（业务项目的最小样板）：
 * 底座经 FoundationModule.forRoot() 一行装配，业务模块并列追加。
 * 真实业务项目可传入 config 覆盖与 replacements（L1/L2 扩展点）：
 *   FoundationModule.forRoot({ config: {...}, replacements: [{ provide: AUDIT_SINK, useClass: MySink }] })
 */
@Module({
  imports: [FoundationModule.forRoot(), HelloModule, UserModule, HealthModule],
})
export class AppModule {}
