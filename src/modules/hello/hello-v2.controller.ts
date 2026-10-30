import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HelloQueryDto } from './hello.dto';

/** v2 并行版本演示：URI 版本化（/api/v2/hello），与 v1 各自独立演进 */
@ApiTags('hello')
@ApiBearerAuth()
@Controller({ path: 'hello', version: '2' })
export class HelloV2Controller {
  @Public()
  @Get()
  @ApiOperation({
    summary: 'v2 示例：结构化返回（与 v1 的纯文本不同，展示版本间响应形态演进）'
  })
  sayHello(@Query() query: HelloQueryDto): {
    version: string;
    message: string;
    generatedAt: string;
  } {
    return {
      version: 'v2',
      message: query.name ? `Hello, ${query.name}! (v2)` : 'Hello, World! (v2)',
      generatedAt: new Date().toISOString()
    };
  }
}
