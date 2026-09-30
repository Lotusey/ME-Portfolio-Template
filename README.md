# ME-Portfolio-Template
Portfolio website template for Mechanical, Civil, Aerospace, etc Engineers

## CAD model library

Add `.dwg` and `.dxf` drawings to `models/2d`, and `.glb`, `.stl`, or `.obj` models to `models/3d`. Add each file to `models/catalog.json` using a path relative to the site root, such as `models/2d/plate-layout.dxf`.

The library is kept at the repository root so it is published correctly by GitHub Pages. Viewer URLs are resolved relative to the site, including when Pages hosts the site below a repository-name path.
