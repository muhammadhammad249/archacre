"use client";

import { useEffect, useState } from "react";
import { uploadMedia } from "./actions";

const ratio: Record<string, string> = { original: "4 / 3", square: "1 / 1", landscape: "16 / 10", portrait: "3 / 4" };

export function MediaUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [aspect, setAspect] = useState("original");
  useEffect(() => {
    const urls = files.slice(0, 8).map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  const tooLarge = files.length > 8 || files.reduce((total, file) => total + file.size, 0) > 3_900_000;
  return <form className="studio-form" action={uploadMedia}>
    <label>Images
      <input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/avif" multiple required
        onChange={event => setFiles(Array.from(event.target.files ?? []))} />
      <span className="studio-field-help">Up to 8 images and 3.9 MB per batch. Images are compressed to WebP.</span>
    </label>
    <label>Crop
      <select name="aspect" value={aspect} onChange={event => setAspect(event.target.value)}>
        <option value="original">Original proportions</option>
        <option value="landscape">Landscape, 16:10</option>
        <option value="square">Square, 1:1</option>
        <option value="portrait">Portrait, 3:4</option>
      </select>
    </label>
    {tooLarge && <p className="notice error" role="alert">Select fewer or smaller images.</p>}
    {previews.length > 0 && <div className="studio-preview">{previews.map((url, index) =>
      <img key={url} src={url} alt={files[index]?.name ?? "Selected image"} style={{ aspectRatio: ratio[aspect], objectFit: aspect === "original" ? "contain" : "cover" }} />)}</div>}
    <div><button type="submit" className="primary" disabled={tooLarge}>Upload images</button></div>
  </form>;
}
