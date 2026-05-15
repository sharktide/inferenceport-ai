param (
    [Parameter(Mandatory = $false)]
    [int]$Count = 1
)

1..$Count | ForEach-Object { (New-Guid).Guid }
