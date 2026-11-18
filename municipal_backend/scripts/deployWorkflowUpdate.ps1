param(
    [string]$Server = $env:PROCURENANCE_DEPLOY_SERVER,
    [string]$ReleaseTag = '20261118'
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Server)) {
    throw 'Specify -Server or set PROCURENANCE_DEPLOY_SERVER (for example, ubuntu@<host>) before running deployment.'
}
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$releaseDirectory = Join-Path $projectDirectory "tmp/workflow-release-$ReleaseTag"
$archive = Join-Path $releaseDirectory "workflow-release-$ReleaseTag.tar.gz"
$identity = Join-Path $env:LOCALAPPDATA 'ProcureNance/ec2-production'
$server = $Server
$remoteDirectory = "/home/ubuntu/workflow-release-$ReleaseTag"

foreach ($requiredFile in @($archive, $identity)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required file is missing: $requiredFile"
    }
}
$digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$connectionOptions = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes', '-i', $identity)

Write-Host 'Connecting to the existing production server...'
& ssh.exe @connectionOptions $server "mkdir -p $remoteDirectory"
if ($LASTEXITCODE -ne 0) { throw 'SSH connection failed. No application changes were made.' }

Write-Host 'Uploading the prepared release...'
& scp.exe @connectionOptions $archive "${server}:$remoteDirectory/release.tar.gz"
if ($LASTEXITCODE -ne 0) { throw 'Release upload failed. No application changes were made.' }

$remoteCommand = "set -eu; cd $remoteDirectory; printf '%s  %s\n' '$digest' release.tar.gz | sha256sum -c -; tar -xzf release.tar.gz; bash -n apply-release.sh; set +e; bash apply-release.sh > release.log 2>&1; release_status=`$?; tail -n 45 release.log; if [ `$release_status -ne 0 ] && [ -f unit-tests.log ]; then tail -n 65 unit-tests.log; fi; exit `$release_status"
Write-Host 'Running staged tests, backup restoration check, deployment, and live verification...'
& ssh.exe @connectionOptions $server $remoteCommand
if ($LASTEXITCODE -ne 0) {
    throw "Deployment did not pass verification. Read the output above; the server log is $remoteDirectory/release.log."
}
Write-Host 'Verified live update: https://procurenance.online'
