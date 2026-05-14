package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Result struct {
	Ok          bool               `json:"ok"`
	CSVPath      string             `json:"csvPath,omitempty"`
	NumericCol   string             `json:"numericColumn,omitempty"`
	RowsScanned  int                `json:"rowsScanned,omitempty"`
	RowsUsed     int                `json:"rowsUsed,omitempty"`
	Min          float64            `json:"min,omitempty"`
	Max          float64            `json:"max,omitempty"`
	Sum          float64            `json:"sum,omitempty"`
	Average      float64            `json:"average,omitempty"`
	Groups       map[string]float64 `json:"groupAverages,omitempty"`
	ErrorMessage string             `json:"error,omitempty"`
}

func parseArgs(argv []string) map[string]string {
	out := map[string]string{}
	for i := 0; i < len(argv); i++ {
		t := argv[i]
		if !strings.HasPrefix(t, "--") {
			continue
		}
		k := strings.TrimPrefix(t, "--")
		v := ""
		if i+1 < len(argv) {
			v = argv[i+1]
			i++
		}
		out[k] = v
	}
	return out
}

func main() {
	args := parseArgs(os.Args[1:])
	csvPath := strings.TrimSpace(args["csv_path"])
	numericColumn := strings.TrimSpace(args["numeric_column"])
	groupBy := strings.TrimSpace(args["group_by"])
	allowedRoot := strings.TrimSpace(args["allowed_root"])

	if csvPath == "" || numericColumn == "" {
		printResult(Result{Ok: false, ErrorMessage: "csv_path and numeric_column are required"}, 1)
		return
	}

	resolved, err := filepath.Abs(csvPath)
	if err != nil {
		printResult(Result{Ok: false, ErrorMessage: err.Error()}, 1)
		return
	}

	if allowedRoot != "" {
		rootAbs, _ := filepath.Abs(allowedRoot)
		if !strings.HasPrefix(strings.ToLower(resolved), strings.ToLower(rootAbs)) {
			printResult(Result{Ok: false, ErrorMessage: "csv_path must stay within allowed_root"}, 1)
			return
		}
	}

	f, err := os.Open(resolved)
	if err != nil {
		printResult(Result{Ok: false, ErrorMessage: err.Error()}, 1)
		return
	}
	defer f.Close()

	r := csv.NewReader(f)
	headers, err := r.Read()
	if err != nil {
		printResult(Result{Ok: false, ErrorMessage: "failed to read CSV headers: " + err.Error()}, 1)
		return
	}

	idxNum := -1
	idxGroup := -1
	for i, h := range headers {
		ht := strings.TrimSpace(h)
		if ht == numericColumn {
			idxNum = i
		}
		if groupBy != "" && ht == groupBy {
			idxGroup = i
		}
	}
	if idxNum < 0 {
		printResult(Result{Ok: false, ErrorMessage: "numeric_column not found"}, 1)
		return
	}
	if groupBy != "" && idxGroup < 0 {
		printResult(Result{Ok: false, ErrorMessage: "group_by column not found"}, 1)
		return
	}

	minV := math.Inf(1)
	maxV := math.Inf(-1)
	sum := 0.0
	used := 0
	scanned := 0
	groupSum := map[string]float64{}
	groupCount := map[string]float64{}

	for {
		rec, err := r.Read()
		if err != nil {
			break
		}
		scanned++
		if idxNum >= len(rec) {
			continue
		}
		v, err := strconv.ParseFloat(strings.TrimSpace(rec[idxNum]), 64)
		if err != nil {
			continue
		}
		if v < minV {
			minV = v
		}
		if v > maxV {
			maxV = v
		}
		sum += v
		used++
		if idxGroup >= 0 && idxGroup < len(rec) {
			g := strings.TrimSpace(rec[idxGroup])
			groupSum[g] += v
			groupCount[g] += 1
		}
	}

	if used == 0 {
		printResult(Result{Ok: false, ErrorMessage: "no numeric rows found"}, 1)
		return
	}

	groups := map[string]float64{}
	for g, s := range groupSum {
		c := groupCount[g]
		if c > 0 {
			groups[g] = s / c
		}
	}

	printResult(Result{
		Ok:         true,
		CSVPath:     resolved,
		NumericCol:  numericColumn,
		RowsScanned: scanned,
		RowsUsed:    used,
		Min:         minV,
		Max:         maxV,
		Sum:         sum,
		Average:     sum / float64(used),
		Groups:      groups,
	}, 0)
}

func printResult(res Result, code int) {
	b, _ := json.MarshalIndent(res, "", "  ")
	fmt.Println(string(b))
	os.Exit(code)
}
