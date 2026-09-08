// FileUploadQuestion.ts
import { ChildEntity } from "typeorm";
import { Question } from "./Question";

@ChildEntity("file_upload")
export class FileUploadQuestion extends Question {}
