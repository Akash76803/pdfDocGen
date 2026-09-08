import { CalculationDefinition, NormalizedRecord } from '@document-tool/contracts';

export interface ICalculationEngine {
  calculate(
    mappedVariables: Record<string, any>,
    calculations: CalculationDefinition[],
    _rawRecord: NormalizedRecord
  ): Record<string, any>;
}

export class CalculationEngine implements ICalculationEngine {
  calculate(
    mappedVariables: Record<string, any>,
    calculations: CalculationDefinition[],
    _rawRecord: NormalizedRecord
  ): Record<string, any> {
    const result = { ...mappedVariables };

    for (const calc of calculations) {
      switch (calc.formula) {
        case 'SUM':
        case 'ADD':
          result[calc.name] = 0; // Phase 0 placeholder
          break;
        case 'COUNT':
          result[calc.name] = 0; // Phase 0 placeholder
          break;
        case 'AVG':
          result[calc.name] = 0; // Phase 0 placeholder
          break;
        case 'MULTIPLY':
          result[calc.name] = 1; // Phase 0 placeholder
          break;
        default:
          result[calc.name] = null;
          break;
      }
    }

    return result;
  }
}
