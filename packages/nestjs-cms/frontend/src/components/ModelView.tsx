import { DataTable } from './DataTable.js';
import { DynamicForm } from './DynamicForm.js';
import { useCmsStore } from '../store.js';
import type { CmsBlueprint } from '../types.js';

interface Props {
  blueprint: CmsBlueprint;
}

export function ModelView({ blueprint }: Props) {
  const { activeModel, view, editRow, openCreate, openEdit, goBack } =
    useCmsStore();
  if (!activeModel) return null;

  const model = blueprint.models[activeModel];
  if (!model) return null;

  const scheme = blueprint.auth.required ? blueprint.auth.scheme : undefined;

  return (
    <div
      style={{
        flex: 1,
        padding: 'clamp(0.75rem, 3vw, 1.5rem)',
      }}
    >
      {view === 'list' && (
        <DataTable
          key={`list-${activeModel}`}
          model={model}
          scheme={scheme}
          onEdit={openEdit}
          onCreate={openCreate}
        />
      )}
      {(view === 'create' || view === 'edit') && (
        <DynamicForm
          key={`form-${activeModel}-${view}`}
          model={model}
          mode={view}
          initial={view === 'edit' ? (editRow ?? undefined) : undefined}
          scheme={scheme}
          onBack={goBack}
        />
      )}
    </div>
  );
}
