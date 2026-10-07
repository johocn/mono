import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { GameException } from '@common/exceptions/game.exception';
import { ErrorCodes } from '@constants/error-codes';

/**
 * 消消乐素材存储（本地磁盘起步，接口保持稳定便于后续换对象存储）
 * 对外通过静态目录 /uploads/xiao-skins/... 访问（见 main.ts）。
 */
const UPLOAD_DIR = process.env.XIAO_UPLOAD_DIR || join(process.cwd(), 'uploads', 'xiao-skins');
const MAX_BYTES = Number(process.env.XIAO_UPLOAD_MAX_BYTES || 2 * 1024 * 1024);
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class StorageService {
  /** 保存图片并返回可访问 URL；类型与体积不达标直接抛业务异常 */
  async saveImage(file: UploadedImage | undefined): Promise<{ url: string; bytes: number }> {
    if (!file || !file.buffer) {
      throw new GameException(ErrorCodes.SKIN_UPLOAD_INVALID, '缺少上传文件');
    }
    if (file.size > MAX_BYTES) {
      throw new GameException(
        ErrorCodes.SKIN_UPLOAD_INVALID,
        `图片体积超过上限（${Math.floor(MAX_BYTES / 1024 / 1024)}MB）`,
      );
    }
    const ext = (extname(file.originalname || '') || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new GameException(ErrorCodes.SKIN_UPLOAD_INVALID, '仅支持 png / jpg / webp 图片');
    }
    await mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
    await writeFile(join(UPLOAD_DIR, name), file.buffer);
    return { url: `/uploads/xiao-skins/${name}`, bytes: file.size };
  }
}
