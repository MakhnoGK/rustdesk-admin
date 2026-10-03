import { Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { AdminController } from '../common/decorators/controllers';
import { toIso } from '../common/time/time';
import { StatsService } from '../stats/stats.service';
import {
  StatsRangeQueryDto,
  StatsSummaryDto,
  TimeseriesPointDto,
  TimeseriesQueryDto,
  TopEntryDto,
  TopQueryDto,
} from './dto/stats.dto';

const range = (q: StatsRangeQueryDto) => ({ from: new Date(q.from), to: new Date(q.to) });

/** Aggregates over sessions whose `startedAt` falls in `[from, to)`, computed in PostgreSQL. */
@AdminController('stats')
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Session totals for a range' })
  @ApiOkResponse({ type: StatsSummaryDto })
  summary(@Query() q: StatsRangeQueryDto): Promise<StatsSummaryDto> {
    return this.stats.summary(range(q));
  }

  @Get('timeseries')
  @ApiOperation({ summary: 'Sessions per UTC hour or day (empty buckets included)' })
  @ApiOkResponse({ type: [TimeseriesPointDto] })
  async timeseries(@Query() q: TimeseriesQueryDto): Promise<TimeseriesPointDto[]> {
    const points = await this.stats.timeseries(range(q), q.bucket);
    return points.map((p) => ({
      bucketStart: toIso(p.bucketStart),
      sessions: p.sessions,
      durationSeconds: p.durationSeconds,
    }));
  }

  @Get('top')
  @ApiOperation({ summary: 'Top initiators or targets by session count' })
  @ApiOkResponse({ type: [TopEntryDto] })
  top(@Query() q: TopQueryDto): Promise<TopEntryDto[]> {
    return this.stats.top(range(q), q.by, q.limit);
  }
}
