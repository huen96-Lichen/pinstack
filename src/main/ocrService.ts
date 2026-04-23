import { AppError } from './errors';

export class OcrService {
  public async recognizeImage(imagePath: string): Promise<string> {
    try {
      const tesseract = await import('tesseract.js');
      const result = await tesseract.recognize(imagePath, 'eng+chi_sim');
      return result.data.text.trim();
    } catch (error) {
      throw new AppError('OCR_FAILED', 'OCR failed', String(error));
    }
  }
}
