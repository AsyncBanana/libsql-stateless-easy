import { libsqlBatchStreamResOkData, libsqlSQLValue, libsqlStatementResOkData } from "libsql-stateless";
import { ResultSet, Row, rawValue, intMode } from "./types.js";
import { Base64 } from "js-base64";
import { ProtoError, ResponseError } from "./errors.js";

//========================================================
function parseLibsqlInt(number: string, intMode?: intMode) {
    switch (intMode) {
      case "number":
        return +number;
      case "string":
        return number;
      default:
        return BigInt(number);
    }
  }

//========================================================
export function libsqlValueParser(value: libsqlSQLValue, intMode?: intMode): rawValue {
    if (value.type==="null") return null;
    if (value.type==="integer") return parseLibsqlInt(value.value, intMode);
    if (value.type==="float") return Number(value.value);
    if (value.type==="text") return value.value;
    if (value.type==="blob") return Base64.toUint8Array(value.base64);
    throw new ProtoError("Invalid data type from server. Cannot parse.");
}

//========================================================
//from hrana-client-ts/src/result.ts
// function rowFromRawValue(
//     colNames: Array<string | undefined>,
//     values: Array<rawValue>
// ): Row {
//     const row = {};
//     // make sure that the "length" property is not enumerable
//     Object.defineProperty(row, "length", { value: values.length });
//     for (let i = 0; i < values.length; ++i) {
//         const value = values[i];
//         Object.defineProperty(row, i, { value });

//         const colName = colNames[i];
//         if (colName !== undefined && !Object.hasOwn(row, colName)) {
//             Object.defineProperty(row, colName, { value, enumerable: true });
//         }
//     }
//     return row as Row;
// }

//========================================================
export function libsqlStatementResParser(
    res: libsqlStatementResOkData,
    intMode?: intMode
): ResultSet {
    let Rows: Array<Row> = [];

    for (let i=0;i<res.rows.length;i++) {
        const row = {};

        Object.defineProperty(row, "length", { value: res.rows[i].length });
        for (let j=0;j<res.rows[i].length;j++) {
            const value = libsqlValueParser(res.rows[i][j],intMode);
            Object.defineProperty(row, j, { value });

            const colName = res.cols[j].name!;
            if (colName !== undefined && !Object.hasOwn(row, colName)) {
                Object.defineProperty(row, colName, { value, enumerable: true });
            }
        }
        Rows.push(row as Row);
    }

    const resultset = {
        rows: Rows,
        columns: res.cols.map(c => c.name||""),
        columnTypes: res.cols.map(c => c.decltype||""),
        rowsAffected: res.affected_row_count,
        lastInsertRowid: (res.last_insert_rowid) ? BigInt(res.last_insert_rowid) : undefined,
    }
    return {
        ...resultset,
        toJSON: (): any => {return resultset}
    }
}

//========================================================
export function libsqlBatchStreamResParser(
    res: libsqlBatchStreamResOkData,
    intMode?: intMode
): Array<ResultSet|null> {
    return res.step_results.map((r, i) => {
        if (r) return libsqlStatementResParser(r,intMode);
        else if (res.step_errors[i]) throw new ResponseError(res.step_errors[i]?.message||"", res.step_errors[i]!);
        else return null;
    });
}

//========================================================
export function libsqlTransactionBatchStreamResParser(
    res: libsqlBatchStreamResOkData,
    intMode?: intMode
): Array<ResultSet> {
    const resResArr = libsqlBatchStreamResParser(res, intMode);
    return resResArr.slice(1, resResArr.length-2).filter(r => r!==null) as Array<ResultSet>;
}