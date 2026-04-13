import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Technology' })
  @IsString()
  @MinLength(1)
  name!: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryResponseDto {
  @ApiProperty({ readOnly: true })
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ readOnly: true, format: 'date-time' })
  createdAt!: string;
}

export class CategoryPageDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  data!: CategoryResponseDto[];

  @ApiProperty()
  total!: number;
}
