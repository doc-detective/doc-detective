import React, { useRef, useState } from "react";
import ReactDOM from "react-dom";
import "./index.css";
import config_v2 from "doc-detective-common/src/schemas/output_schemas/config_v2.schema.json";
import spec_v2 from "doc-detective-common/src/schemas/output_schemas/spec_v2.schema.json";
import Form from "./components/Form";
import FileUploader from "./FileUploader";
import TestButton from "./Button";
import AppBar from "./components/AppBar";
import { Accordion, AccordionDetails, AccordionSummary } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const uiSchema = {};

const log = (type) => console.log.bind(console, type);

function App() {
  const [selectedSchema, setSelectedSchema] = useState("");
  const formRef = useRef(null);

  const handleSchemaChange = (event) => {
    setSelectedSchema(event.target.value);
  };

  // React.useEffect(() => {
  //   formRef.current.forceUpdate();
  // }, [selectedSchema]);

  return (
    <div>
      <AppBar />
      <div class="body">
        {/* <TestButton /> */}
        {/* <FileUploader /> */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            Check a link
          </AccordionSummary>
          <AccordionDetails>
            <Form ref={formRef} key={selectedSchema} schema="checkLink_v2" />
          </AccordionDetails>
        </Accordion>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            Wait
          </AccordionSummary>
          <AccordionDetails>
            <Form ref={formRef} key={selectedSchema} schema="wait_v2" />
          </AccordionDetails>
        </Accordion>
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
