import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import useDraftStore from '../src/stores/useDraftStore.js'; // Adjust path as needed
import GenericComponent from '../src/components/GenericComponent.jsx'; // Adjust path as needed

// Function to generate HTML for a page
const generatePageHtml = (page, allComponents) => {
  const renderableComponents = page.children
    .map(componentId => allComponents.find(comp => comp.id === componentId))
    .filter(Boolean);

  const appHtml = ReactDOMServer.renderToString(
    <div>
      {renderableComponents.map((component, index) => (
        <GenericComponent
          key={component.id}
          component={component}
          index={index}
          pageId={page.id}
        />
      ))}
    </div>
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${page.name}</title>
    <style>
        body { margin: 0; font-family: sans-serif; }
        /* Basic styles for components - will be expanded */
        p { margin: 0; }
        button { cursor: pointer; }
        img { max-width: 100%; height: auto; display: block; }
    </style>
</head>
<body>
    <div id="root">${appHtml}</div>
</body>
</html>`;
};

// Main build function
const buildSite = () => {
  const state = useDraftStore.getState().history.present; // Get the current state
  const { pages, components, assets } = state;

  const distDir = path.resolve(process.cwd(), 'dist');

  // Create dist directory if it doesn't exist
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  // Generate HTML for each page
  pages.forEach(page => {
    const htmlContent = generatePageHtml(page, components);
    const fileName = page.slug === '/' ? 'index.html' : `${page.slug.substring(1)}.html`;
    fs.writeFileSync(path.join(distDir, fileName), htmlContent);
    console.log(`Generated ${fileName}`);
  });

  // Handle assets (MVP: just log, later save actual files)
  if (assets && assets.length > 0) {
    const assetsDir = path.join(distDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir);
    }
    assets.forEach(asset => {
      // In a real scenario, decode base64 and save file
      console.log(`Saving asset: ${asset.name} (placeholder)`);
      // fs.writeFileSync(path.join(assetsDir, asset.name), Buffer.from(asset.data, 'base64'));
    });
  }

  console.log('Site build complete in /dist directory.');
};

// Execute the build
buildSite();
