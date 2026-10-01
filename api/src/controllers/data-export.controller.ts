import type { Context } from 'hono'
import { DataExportService } from '../services/data-export.service'

export class DataExportController {
  constructor(private service: DataExportService) {}

  async getJSON(c: Context) {
    c.header('Cache-Control', 'no-store')
    c.header('Content-Type', 'application/json; charset=utf-8')
    return c.body(await this.service.exportJSON())
  }
}
