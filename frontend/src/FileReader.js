import React, { useState } from 'react';

const FileReader = () => {
  const [fileContents, setFileContents] = useState('');

  const isElectron = window && window.process && window.process.type;

  const readFile = () => {
    if (isElectron) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('read-file');
      ipcRenderer.on('file-data', (event, data) => {
        setFileContents(data);
      });
    } else {
      fetch('/read-file')
        .then(response => response.text())
        .then(data => setFileContents(data))
        .catch(err => console.error(err));
    }
  };

  return (
    <div className="p-10">
      <button
        onClick={readFile}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        Read File
      </button>
      <pre className="mt-4 p-4 bg-gray-100 rounded">{fileContents}</pre>
    </div>
  );
};

export default FileReader;
