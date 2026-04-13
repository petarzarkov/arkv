import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsInt,
  IsOptional,
  MinLength,
  IsObject,
} from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ example: 'Hello World' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional({ example: 'Post body goes here...' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  published?: boolean;

  @ApiProperty({ description: 'ID of the author (user)' })
  @IsInt()
  authorId!: number;

  @ApiPropertyOptional({
    description: 'Arbitrary JSON metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdatePostDto extends PartialType(CreatePostDto) {}

export class PostResponseDto {
  @ApiProperty({ readOnly: true })
  id!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  published!: boolean;

  @ApiProperty({ description: 'ID of the author (user)' })
  authorId!: number;

  @ApiPropertyOptional({
    description: 'Arbitrary JSON metadata',
    type: 'object',
    additionalProperties: true,
  })
  metadata?: Record<string, unknown> | null;

  @ApiProperty({ readOnly: true, format: 'date-time' })
  createdAt!: string;
}

export class PostCursorPageDto {
  @ApiProperty({ type: [PostResponseDto] })
  data!: PostResponseDto[];

  @ApiProperty({ nullable: true, type: Number })
  nextCursor!: number | null;
}
