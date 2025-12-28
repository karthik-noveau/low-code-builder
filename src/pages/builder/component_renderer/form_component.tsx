import type { ComponentRendererProps } from './types';
import { ComponentToolbar } from './component_toolbar';
import { setDraggedComponentId, hideDragPreview } from './index';
import styles from './style.module.css';

export const FormComponent = ({ component, index, pageId, isSelected, onSelect, onDuplicate, onDelete}: ComponentRendererProps) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(component.id);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('componentId', component.id);
    e.dataTransfer.setData('sourceIndex', index.toString());
    e.dataTransfer.setData('pageId', pageId);
    setDraggedComponentId(component.id, component.type);
    hideDragPreview(e);  };

  const handleDragEnd = () => {
    setDraggedComponentId(null, null);
  };

  const highlightStyle = isSelected
    ? { outline: '2px solid #4F46E5', outlineOffset: '2px', cursor: 'pointer' }
    : { cursor: 'pointer' };

  const config = (component as any).config || {};
  const fields = config.fields || [];
  const submitText = config.submitText || 'Submit';

  return (
    <div className={`${styles.componentWrapper} ${isSelected ? styles.selected : ''}`}>
      {isSelected && <ComponentToolbar onDuplicate={() => onDuplicate(component.id)} onDelete={() => onDelete(component.id)} />}
      <form
        style={{ ...component.styles, ...highlightStyle }}
        onClick={handleClick}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onSubmit={(e) => e.preventDefault()}
      >
        {fields.map((field: any, idx: number) => (
          <div key={idx} style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              {field.label}
              {field.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                placeholder={field.placeholder}
                required={field.required}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            ) : (
              <input
                type={field.type}
                placeholder={field.placeholder}
                required={field.required}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            )}
          </div>
        ))}
        <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#4F46E5', color: '#fff', border: 'none', borderRadius: '8px' }}>
          {submitText}
        </button>
      </form>
    </div>
  );
};
