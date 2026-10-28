import type { TemplateDef } from './types';

/** Resolves preset inheritance without mutating source definitions. */
export function resolveTemplateInheritance(templates: readonly TemplateDef[]): TemplateDef[] {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const resolved = new Map<string, TemplateDef>();
  const resolving = new Set<string>();
  return templates.map((template) => resolveOne(template, byId, resolved, resolving));
}

function resolveOne(
  template: TemplateDef,
  byId: ReadonlyMap<string, TemplateDef>,
  resolved: Map<string, TemplateDef>,
  resolving: Set<string>,
): TemplateDef {
  const cached = resolved.get(template.id);
  if (cached) return cached;
  if (resolving.has(template.id)) throw new Error(`Herencia circular de plantillas: ${template.id}`);
  resolving.add(template.id);
  const parent = template.extendsId ? byId.get(template.extendsId) : undefined;
  if (template.extendsId && !parent) throw new Error(`La plantilla ${template.id} hereda de una plantilla inexistente: ${template.extendsId}`);
  const base = parent ? resolveOne(parent, byId, resolved, resolving) : undefined;
  const merged: TemplateDef = {
    ...(base ?? {} as TemplateDef),
    ...template,
    ...(base?.printProfile || template.printProfile ? {
      printProfile: { ...(base?.printProfile ?? {}), ...(template.printProfile ?? {}) } as NonNullable<TemplateDef['printProfile']>,
    } : {}),
  };
  delete (merged as Partial<TemplateDef>).extendsId;
  resolving.delete(template.id);
  resolved.set(template.id, merged);
  return merged;
}
