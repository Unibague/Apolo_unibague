// src/types/Question.ts

export enum QuestionType {
  TEST = "test",
  OPEN = "open",
  FILL_BLANKS = "fill_blanks",
  MATCHING = "matching",
  FILE_UPLOAD = "file_upload",
}

interface base_question_dto {
  enunciado: string;
  puntaje: number;
  type: QuestionType;
  id_examen: number;
}

interface test_option_dto {
  texto: string;
  esCorrecta: boolean;
}

interface test_question_dto {
  shuffleOptions: boolean;
  options: test_option_dto[];
}

export interface creado_test_question_dto
  extends base_question_dto,
    test_question_dto {}