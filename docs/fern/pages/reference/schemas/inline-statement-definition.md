---
title: "Inline statement definition"
---

Statements to include tests and steps inside the content of the file, such as within Markdown.

## Referenced In

- [File type (custom)](/reference/schemas/file-type-custom)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
testStart | one of:<br/>- string<br/>- array of string | Optional. Regular expressions that indicate the start of a test. If capture groups are used, the first capture group is used for the statement. If no capture groups are used, the entire match is used for the statement. | 
testEnd | one of:<br/>- string<br/>- array of string | Optional. Regular expressions that indicate that the current test is complete. | 
ignoreStart | one of:<br/>- string<br/>- array of string | Optional. Regular expressions that indicates that the following content should be ignored for testing purposes. | 
ignoreEnd | one of:<br/>- string<br/>- array of string | Optional. Regular expressions that indicate that the ignored section of content is complete. | 
step | one of:<br/>- string<br/>- array of string | Optional. Regular expressions that indicate a step in a test. | 

## Examples
