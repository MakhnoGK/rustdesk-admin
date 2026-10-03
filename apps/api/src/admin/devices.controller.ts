import { Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AdminController } from '../common/decorators/controllers';
import { AdminErrorDto } from '../common/errors/error.dto';
import { parseSort } from '../common/pagination/pagination';
import { DEVICE_SORT_FIELDS, DevicesService } from '../devices/devices.service';
import { toDeviceDetailDto, toDeviceDto } from './admin.mappers';
import { DeviceDetailDto, DeviceListQueryDto, DevicePageDto } from './dto/devices.dto';

@AdminController('devices')
export class AdminDevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'List devices (those that sent a heartbeat or system info)' })
  @ApiOkResponse({ type: DevicePageDto })
  async list(@Query() q: DeviceListQueryDto): Promise<DevicePageDto> {
    const now = new Date();
    const page = await this.devices.list(
      {
        search: q.search,
        online: q.online,
        page: q.page,
        pageSize: q.pageSize,
        sort: parseSort(q.sort, DEVICE_SORT_FIELDS, {
          field: 'lastHeartbeatAt',
          direction: 'desc',
        }),
      },
      now,
    );
    return { ...page, data: page.data.map((d) => toDeviceDto(d, this.devices.isOnline(d, now))) };
  }

  @Get(':uuid')
  @ApiParam({ name: 'uuid', description: 'Machine UUID (base64, URL-encoded)' })
  @ApiOperation({ summary: 'Get a device with its system info and RustDesk ID history' })
  @ApiOkResponse({ type: DeviceDetailDto })
  @ApiNotFoundResponse({ type: AdminErrorDto })
  async get(@Param('uuid') uuid: string): Promise<DeviceDetailDto> {
    const { device, idChanges } = await this.devices.getByUuid(uuid);
    return toDeviceDetailDto(device, this.devices.isOnline(device), idChanges);
  }
}
