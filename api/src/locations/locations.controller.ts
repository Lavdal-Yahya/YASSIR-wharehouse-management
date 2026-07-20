import { Controller, Get } from '@nestjs/common';
import { LocationType, Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

export type LocationOut = {
  id: string;
  name: string;
  type: LocationType;
  shopId: string | null;
  active: boolean;
};

// Small read-only surface so the frontend can resolve the warehouse's id
// (there's exactly one) and build location pickers for movement filters.
// All authenticated roles read — location metadata is not sensitive.

@Controller('locations')
export class LocationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get()
  async list(): Promise<LocationOut[]> {
    const rows = await this.prisma.location.findMany({
      where: { active: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      shopId: r.shopId,
      active: r.active,
    }));
  }
}
