import { QuestionType } from "../types/Question";
import { BaseQuestionDto } from "./base-question.dto";

export class FileUploadQuestionDto extends BaseQuestionDto {
  type: QuestionType.FILE_UPLOAD = QuestionType.FILE_UPLOAD;
}
