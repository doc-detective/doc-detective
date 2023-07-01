import React, { useState } from "react";

const FileUploader = () => {
  const [jsonData, setJsonData] = useState(null);

  const onFileChange = (e) => {
    const file = e.target.files[0];
    
    if (!file) {
      console.log("No file chosen");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        setJsonData(json);
        console.log("JSON data successfully loaded", json);
      } catch (error) {
        console.error("Error parsing JSON", error);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <input type="file" accept=".json" onChange={onFileChange} />
    </div>
  );
};

export default FileUploader;
