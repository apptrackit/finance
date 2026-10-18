import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {AlertProvider,useAlert} from './AlertContext'
import {Modal} from '../components/common/modal'
afterEach(cleanup)
it('traps confirmation keys, cancels Escape without closing its parent, and restores focus',async()=>{
 const parentClose=vi.fn(),answer=vi.fn()
 function Editor(){const {confirm}=useAlert();return <Modal isOpen onClose={parentClose} title="Trade editor"><button onClick={()=>{void confirm({title:'Delete pair?',message:'Reverse both records?',confirmText:'Delete',cancelText:'Keep trade'}).then(answer)}}>Ask</button></Modal>}
 render(<AlertProvider><Editor/></AlertProvider>)
 const ask=screen.getByRole('button',{name:'Ask'});ask.focus();fireEvent.click(ask)
 const confirmation=await screen.findByRole('alertdialog',{name:'Delete pair?'})
 const cancel=within(confirmation).getByRole('button',{name:'Keep trade'}),accept=within(confirmation).getByRole('button',{name:'Delete'})
 expect(cancel).toHaveFocus();fireEvent.keyDown(cancel,{key:'Tab'});expect(accept).toHaveFocus()
 fireEvent.keyDown(accept,{key:'Tab',shiftKey:true});expect(cancel).toHaveFocus()
 fireEvent.keyDown(cancel,{key:'Escape'})
 await waitFor(()=>expect(answer).toHaveBeenCalledWith(false));expect(parentClose).not.toHaveBeenCalled()
 await waitFor(()=>expect(ask).toHaveFocus());expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})
