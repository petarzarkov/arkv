import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'admin123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty()
  access_token!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate and receive a JWT' })
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto.email, dto.password);
  }
}
