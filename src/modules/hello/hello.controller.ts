import { Controller, Get, Query } from '@nestjs/common';
import { ErrorCode } from '../../common/error-codes';
import { BizException } from '../../common/exceptions/biz.exception';
import { HelloQueryDto } from './hello.dto';
import { HelloService } from './hello.service';
import { ApiBearerAuth } from '@nestjs/swagger';

/** 旧路由 GET / 、GET /hello/world 迁移为 /api/v1/hello 、/api/v1/hello/world */
@Controller('hello')
@ApiBearerAuth()
@ApiBearerAuth()
export class HelloController {
  constructor(private readonly helloService: HelloService) {}

  /** GET /api/v1/hello?name=xx —— 演示查询参数校验 */
  @Get()
  sayHello(@Query() query: HelloQueryDto): string {
    return this.helloService.getHello(query.name);
  }

  /** GET /api/v1/hello/world */
  @Get('world')
  getHelloWorld(@Query() query: HelloQueryDto): string {
    return this.helloService.getHelloWorld(query.name);
  }

  /** GET /api/v1/hello/error —— 演示 BizException → 统一错误响应（30000 / HTTP 422） */
  @Get('error')
  throwError(): never {
    throw new BizException(ErrorCode.BIZ_ERROR, '示例业务异常', {
      hint: '由 BizException 抛出'
    });
  }
}
