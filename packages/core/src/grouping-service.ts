import type { GroupingResult, MappingProfile, MappingValidationResult, NormalizedData } from '@document-tool/contracts';
import { GroupingEngine } from '@document-tool/grouping-engine';
import { MappingEngine } from '@document-tool/mapping-engine';

export class MappingGroupingService {
  private readonly mappingEngine = new MappingEngine();
  private readonly groupingEngine = new GroupingEngine(this.mappingEngine);

  validate(data: NormalizedData, profile: MappingProfile): MappingValidationResult {
    return this.mappingEngine.validate(profile, data.schema);
  }

  buildGroups(data: NormalizedData, profile: MappingProfile): GroupingResult {
    return this.groupingEngine.group(data, profile);
  }
}
