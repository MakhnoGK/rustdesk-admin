import { Module } from '@nestjs/common';
import { DisconnectsService } from './disconnects.service';

@Module({
  providers: [DisconnectsService],
  exports: [DisconnectsService],
})
export class DisconnectsModule {}
