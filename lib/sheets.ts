import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  })
}

// Appends a row keyed by column header rather than by position: each value
// lands under the column whose header matches its label, regardless of how
// FIELDS or the sheet's columns are ordered. Unknown labels are added as new
// columns on the right, and the header row is created on the first write.
export async function appendRow(data: Record<string, string>, tab = 'Parents') {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not set')

  // Read the existing header row (row 1) so we can align by label.
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!1:1`,
  })
  const header: string[] = headerRes.data.values?.[0]?.map(String) ?? []

  // Extend the header with any labels it doesn't have yet, appended on the
  // right so existing column positions never shift.
  const newHeader = [...header]
  for (const label of Object.keys(data)) {
    if (!newHeader.includes(label)) newHeader.push(label)
  }
  if (newHeader.length !== header.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tab}!1:1`,
      valueInputOption: 'RAW',
      requestBody: { values: [newHeader] },
    })
  }

  // Place each value under its header column; columns without a value stay blank.
  const row = newHeader.map((label) => data[label] ?? '')

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  })
}
