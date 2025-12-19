import { Context } from 'hono'
import { AccountService } from '../services/account.service'
import { AccountMapper } from '../mappers/account.mapper'
import { CreateAccountDto, UpdateAccountDto } from '../dtos/account.dto'

export class AccountController {
  constructor(private accountService: AccountService) {}

  async getAll(c: Context) {
    const accounts = await this.accountService.getAllAccounts()
    return c.json(accounts.map(AccountMapper.toResponseDto))
  }

  async create(c: Context) {
    const body = await c.req.json<CreateAccountDto>()
    const account = await this.accountService.createAccount(body)
    return c.json(AccountMapper.toResponseDto(account), 201)
  }

  async update(c: Context) {
    const id = c.req.param('id')
    const body = await c.req.json<UpdateAccountDto>()
    const account = await this.accountService.updateAccount(id, body)
    return c.json(AccountMapper.toResponseDto(account))
  }

  async delete(c: Context) {
    const id = c.req.param('id')
    await this.accountService.deleteAccount(id)
    return c.json({ success: true })
  }
}
