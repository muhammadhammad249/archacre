"use client";

import { useState, useRef } from "react";
import { cmsSections, sectionDefinition, websitePages, type CmsSection, type CmsValue, type ContentItem } from "@/lib/studio-model";
import { saveContent } from "./actions";

export function ContentEditor({ section, defaultValue }: { section: CmsSection; defaultValue: CmsValue }) {
  const definition = sectionDefinition(section);
  const [values, setValues] = useState<ContentItem>(() => Object.fromEntries((definition.fields ?? []).map(field => [field.key, String(defaultValue[field.key] ?? "")])));
  const [rows, setRows] = useState(() => (Array.isArray(defaultValue.items) ? defaultValue.items : [])
    .map((item, index) => ({ id: index, item })));
  const nextId = useRef(rows.length);

  function move(index: number, difference: number) {
    setRows(current => {
      const copy = current.slice();
      const target = index + difference;
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  function fieldInput(field: NonNullable<ReturnType<typeof sectionDefinition>["fields"]>[number], value: string, update: (text: string) => void) {
    const base = {
      value, required: field.required, maxLength: field.limit,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => update(event.target.value),
    };
    if (field.format === "navigation") {
      return <select {...base}><option value="">Choose a page</option>{websitePages.map(path => <option key={path}>{path}</option>)}</select>;
    }
    if (field.multiline) return <textarea {...base} />;
    return <input {...base} type={field.format === "email" || field.format === "url" ? field.format : "text"} />;
  }

  const document = { ...values, ...(definition.items ? { items: rows.map(row => row.item) } : {}) };
  return <form className="studio-form" action={saveContent} aria-label={cmsSections[section].title}>
    <input type="hidden" name="key" value={section} />
    <input type="hidden" name="document" value={JSON.stringify(document)} />
    {(definition.fields ?? []).map(field => <label key={field.key}>{field.label}
      {fieldInput(field, values[field.key], next => setValues(current => ({ ...current, [field.key]: next })))}
    </label>)}
    {definition.items && <>
      {rows.map(({ id, item }, index) => <fieldset className="studio-panel studio-form" key={id}>
        <legend>{definition.items?.label} {index + 1}</legend>
        {definition.items!.fields.map(field => <label key={field.key}>{field.label}
          {fieldInput(field, item[field.key] ?? "", next => setRows(list => list.map(row => row.id === id
            ? { id, item: { ...row.item, [field.key]: next } } : row)))}
        </label>)}
        <div className="studio-inline">
          <button type="button" className="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</button>
          <button type="button" className="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>Move down</button>
          <button type="button" className="button danger" onClick={() => setRows(list => list.filter(row => row.id !== id))}>Remove</button>
        </div>
      </fieldset>)}
      <div><button type="button" className="button" disabled={rows.length >= 50} onClick={() => {
        const id = nextId.current++;
        const item = Object.fromEntries(definition.items!.fields.map(field => [field.key, ""]));
        setRows(list => [...list, { id, item }]);
      }}>Add {definition.items.label}</button></div>
    </>}
    <div><button type="submit" className="primary">Save changes</button></div>
  </form>;
}
