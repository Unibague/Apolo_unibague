// question-dto-map.ts
import { QuestionType } from "../types/Question";
import { TestQuestionDto } from "./add-test-question.dto";
import { BaseQuestionDto } from "./base-question.dto";
import { OpenQuestionDto } from "./add-open-question.dto";
import { FillBlankQuestionDto } from "./add-blank-question.dto";
import { MatchingQuestionDto } from "./add-matching-question.dto";
import { FileUploadQuestionDto } from "./add-file-upload-question.dto";


export const QUESTION_DTO_MAP: Record<QuestionType, new () => BaseQuestionDto> =
  {
    [QuestionType.TEST]: TestQuestionDto,
    [QuestionType.OPEN]: OpenQuestionDto,
    [QuestionType.FILL_BLANKS]: FillBlankQuestionDto,
    [QuestionType.MATCHING]: MatchingQuestionDto,
    [QuestionType.FILE_UPLOAD]: FileUploadQuestionDto,
  };
