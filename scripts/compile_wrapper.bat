@echo off
if defined TSC_AFFINITY_MASK (
    start "" /affinity %TSC_AFFINITY_MASK% /b tsc %*
) else (
    tsc %*
)
