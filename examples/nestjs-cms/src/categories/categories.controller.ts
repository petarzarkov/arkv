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
import { CategoriesService } from './categories.service.js';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryResponseDto,
  CategoryPageDto,
} from './dto/category.dto.js';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories (offset paginated)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiOkResponse({ type: CategoryPageDto })
  findAll(
    @Query('offset') offset = 0,
    @Query('limit') limit = 10,
  ): Promise<CategoryPageDto> {
    return this.categoriesService.findAll(Number(offset), Number(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by id' })
  @ApiOkResponse({ type: CategoryResponseDto })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<CategoryResponseDto> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiOkResponse({ type: CategoryResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a category' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
