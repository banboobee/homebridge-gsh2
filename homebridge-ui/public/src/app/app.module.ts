import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { MarkdownViewerComponent } from './markdown-viewer.component';
import { UserDataComponent } from './user-data.component';

import '@homebridge/plugin-ui-utils/dist/ui.interface';
import { TranslatePipe } from './translate.pipe';
import { DateToStringPipe } from './user-data.pipe';

@NgModule({
  declarations: [
    AppComponent,
    TranslatePipe,
    MarkdownViewerComponent,
    UserDataComponent,
    DateToStringPipe,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
  exports: [
    DateToStringPipe // so it can be used elsewhere
  ]
})
export class AppModule { }
