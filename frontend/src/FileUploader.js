import React, { useState } from "react";
import Button from '@mui/material/Button';

const FileUploader = () => {
  const [jsonData, setJsonData] = useState(null);

  const myFunction = () => {
    console.log("Button was clicked!");
  }
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
      <label htmlFor="upload-json">
        <input
          style={{ display: 'none' }}
          id="upload-json"
          name="upload-json"
          type="file"
          accept=".json"
          ononChange={onFileChange}
        />

        <Button color="secondary" variant="contained" component="span">
          Upload button
        </Button>
      </label>
    </div>
  );
};

export default FileUploader;
