import { Context } from 'hono'
import { AccountService } from '../services/account.service'
import { AccountMapper } from '../mappers/account.mapper'
import { CreateAccountDto, UpdateAccountDto } from '../dtos/account.dto'
import { AuditRepository } from '../repositories/audit.repository'
import { Bindings } from '../types/environment.types'

export class AccountController {
  constructor(private accountService: AccountService) {}

  async getAll(c: Context) {
    const accounts = await this.accountService.getAllAccounts()
    return c.json(accounts.map(AccountMapper.toResponseDto))
  }

  async create(c: Context<{ Bindings: Bindings }>) {
    const body = await c.req.json<CreateAccountDto>()
    const account = await this.accountService.createAccount(body)
    await new AuditRepository(c.env.DB).log('CREATE', 'account', account.id, { name: account.name, type: account.type })
    return c.json(AccountMapper.toResponseDto(account), 201)
  }

  async update(c: Context<{ Bindings: Bindings }>) {
    const id = c.req.param('id')
    const body = await c.req.json<UpdateAccountDto>()
    const account = await this.accountService.updateAccount(id, body)
    await new AuditRepository(c.env.DB).log('UPDATE', 'account', id, { name: body.name, balance: body.balance })
    return c.json(AccountMapper.toResponseDto(account))
  }

  async delete(c: Context<{ Bindings: Bindings }>) {
    const id = c.req.param('id')
    await this.accountService.deleteAccount(id)
    await new AuditRepository(c.env.DB).log('DELETE', 'account', id)
    return c.json({ success: true })
  }
}
