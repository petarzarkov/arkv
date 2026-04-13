import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PostsService } from './posts.service.js';
import {
  CreatePostDto,
  UpdatePostDto,
  PostResponseDto,
  PostCursorPageDto,
} from './dto/post.dto.js';

@ApiTags('posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiOperation({ summary: 'List posts (cursor paginated)' })
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiOkResponse({ type: PostCursorPageDto })
  findAll(
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 10,
  ): Promise<PostCursorPageDto> {
    return this.postsService.findAll(
      cursor !== undefined ? Number(cursor) : undefined,
      Number(limit),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get post by id' })
  @ApiOkResponse({ type: PostResponseDto })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PostResponseDto> {
    return this.postsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a post' })
  @ApiCreatedResponse({ type: PostResponseDto })
  create(@Body() dto: CreatePostDto): Promise<PostResponseDto> {
    return this.postsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a post' })
  @ApiOkResponse({ type: PostResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    return this.postsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a post' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.postsService.remove(id);
  }
}
