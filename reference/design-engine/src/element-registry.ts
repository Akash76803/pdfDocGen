import type { DesignElement } from '@document-tool/contracts';

export interface DesignElementRegistration {
  key:string;
  validate?: (element:DesignElement)=>string[];
}

export class DesignElementRegistry {
  private readonly registrations = new Map<string,DesignElementRegistration>();
  register(registration:DesignElementRegistration):this {
    const key=registration.key.trim();
    if (!key) throw new Error('Design element registration key is required.');
    if (this.registrations.has(key)) throw new Error(`Design element type already registered: ${key}`);
    this.registrations.set(key,{...registration,key});
    return this;
  }
  has(element:DesignElement):boolean { return this.registrations.has(getElementRegistrationKey(element)); }
  validate(element:DesignElement):string[] { return this.registrations.get(getElementRegistrationKey(element))?.validate?.(element) ?? []; }
  keys():string[] { return [...this.registrations.keys()]; }
}

export function getElementRegistrationKey(element:DesignElement):string {
  return element.type==='CUSTOM' ? `CUSTOM:${element.customType}` : element.type;
}

export function createDefaultDesignElementRegistry():DesignElementRegistry {
  const registry=new DesignElementRegistry();
  for (const key of ['TEXT','SHAPE','IMAGE','SVG','QR','BARCODE','PATH']) registry.register({key});
  return registry;
}
