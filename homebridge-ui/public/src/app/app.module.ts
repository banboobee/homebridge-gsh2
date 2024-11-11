import { NgModule } from '@angular/core'
import { BrowserModule } from '@angular/platform-browser'

import { AppComponent } from './app.component'

import { TranslatePipe } from './translate.pipe'
import '@homebridge/plugin-ui-utils/dist/ui.interface'

@NgModule({
  declarations: [
    AppComponent,
    TranslatePipe,
  ],
  imports: [
    BrowserModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule { }
