param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Output
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$resolvedSource = (Resolve-Path -LiteralPath $Source).Path
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedSource)
$stream = $archive.GetEntry('word/document.xml').Open()
$settings = [System.Xml.XmlReaderSettings]::new()
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$reader = [System.Xml.XmlReader]::Create($stream, $settings)
$paragraphs = [System.Collections.Generic.List[object]]::new()
$paragraphNumber = 0
$foundLabel = $false
$foundCheckpoint = $false
try {
  while ($reader.Read()) {
    if ($reader.NodeType -ne [System.Xml.XmlNodeType]::Element -or $reader.LocalName -ne 'p' -or $reader.NamespaceURI -ne 'http://schemas.openxmlformats.org/wordprocessingml/2006/main') { continue }
    $sub = $reader.ReadSubtree()
    $value = [System.Text.StringBuilder]::new()
    while ($sub.Read()) {
      if ($sub.NodeType -ne [System.Xml.XmlNodeType]::Element) { continue }
      if ($sub.LocalName -in @('del', 'ins', 'moveFrom', 'moveTo')) { throw 'Resolve tracked changes in the source prefix before importing.' }
      if ($sub.LocalName -eq 't') { [void]$sub.Read(); [void]$value.Append($sub.Value) }
      elseif ($sub.LocalName -eq 'tab') { [void]$value.Append("`t") }
      elseif ($sub.LocalName -eq 'br') { [void]$value.Append("`n") }
    }
    $sub.Dispose()
    $paragraphNumber++
    $textValue = $value.ToString().Trim()
    if (-not $textValue) { continue }
    $paragraphs.Add(@{ text = $textValue; paragraph = $paragraphNumber })
    if ($foundLabel) {
      if ($textValue -cne 'Emergency response equipment and supplies') { throw 'The Item Description does not match the authorized stopping point.' }
      $foundCheckpoint = $true
      break
    }
    if ($textValue -ceq 'Item Description') { $foundLabel = $true }
  }
  if (-not $foundCheckpoint) { throw 'The exact Item Description stopping point was not found.' }
} finally { $reader.Dispose(); $stream.Dispose(); $archive.Dispose() }
$start = -1
for ($i = 0; $i -lt $paragraphs.Count; $i++) { if ($paragraphs[$i].text -ceq 'Fiscal Year') { $start = $i; break } }
if ($start -lt 0 -or ($paragraphs.Count - $start) % 2 -ne 0) { throw 'Source fields are not an unambiguous label/value sequence.' }
$fields = @()
for ($i = $start; $i -lt $paragraphs.Count; $i += 2) {
  $fields += [ordered]@{ label = $paragraphs[$i].text; value = $paragraphs[$i + 1].text; sourceParagraph = $paragraphs[$i + 1].paragraph }
}
$manifest = [ordered]@{
  version = 1
  source = [ordered]@{ filename = [System.IO.Path]::GetFileName($resolvedSource); sha256 = (Get-FileHash -LiteralPath $resolvedSource -Algorithm SHA256).Hash.ToLowerInvariant() }
  checkpoint = 'Item Description: Emergency response equipment and supplies'
  fields = $fields
}
$outputPath = [System.IO.Path]::GetFullPath($Output)
[System.IO.File]::WriteAllText($outputPath, ($manifest | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
Write-Output "Extracted $($fields.Count) fields. Stopped at Item Description, source paragraph $paragraphNumber."
