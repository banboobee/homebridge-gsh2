import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { NgbAccordionModule } from '@ng-bootstrap/ng-bootstrap';
import { AppComponent } from './app.component';

import '@homebridge/plugin-ui-utils/dist/ui.interface';
import { TranslatePipe } from './translate.pipe';

@NgModule({
  declarations: [
    AppComponent,
    TranslatePipe,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    NgbAccordionModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule { }
