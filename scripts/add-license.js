/*
Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const fs = require('fs');
const path = require('path');

const headerText = `Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`;

// Comment styles per file type
const commentStyles = {
  '.js': { open: '/*', close: '*/' },
  '.ts': { open: '/*', close: '*/' },
  '.css': { open: '/*', close: '*/' },
  '.html': { open: '<!--', close: '-->' }
};

const targetExtensions = Object.keys(commentStyles);

function formatHeader(ext) {
  const { open, close } = commentStyles[ext];
  return `${open}\n${headerText}\n${close}\n`;
}

function processFile(filePath) {
  const ext = path.extname(filePath);
  const header = formatHeader(ext);
  const content = fs.readFileSync(filePath, 'utf8');

  if (content.includes(headerText)) return; // Skip if already added

  const updatedContent =
    ext === '.html' ? content + '\n' + header : header + '\n' + content;

  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log(`✔️ Updated: ${filePath}`);
}

function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (file === 'node_modules') return; // Skip node_modules
      walkDir(fullPath);
    } else if (targetExtensions.includes(path.extname(fullPath))) {
      processFile(fullPath);
    }
  });
}

// Start from current directory
walkDir(process.cwd());
