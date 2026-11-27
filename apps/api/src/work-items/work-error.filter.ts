import { WorkError } from '@graveshift/work';
import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';

@Catch(WorkError)
export class WorkErrorFilter implements ExceptionFilter<WorkError> {
  catch(error: WorkError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();
    response.status(error.status).json(error.toJSON());
  }
}
