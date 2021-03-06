/*
 * Copyright (C) 2003-2017 eXo Platform SAS.
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
package org.exoplatform.webconferencing.webrtc;

import org.exoplatform.webconferencing.CallProviderSettings;

/**
 * Created by The eXo Platform SAS.
 *
 * @author <a href="mailto:pnedonosko@exoplatform.com">Peter Nedonosko</a>
 * @version $Id: WebrtcSettings.java 00000 Aug 15, 2017 pnedonosko $
 */
public class WebrtcSettings extends CallProviderSettings {

  /** The call URI. */
  protected final String callUri;

  /**
   * Instantiates a new webrtc settings.
   *
   * @param type the type
   * @param supportedTypes the supported types
   * @param title the title
   * @param callTitle the call title
   * @param joinTitle the join title
   * @param version the version
   * @param callUri the call URI
   */
  public WebrtcSettings(String type,
                        String[] supportedTypes,
                        String title,
                        String callTitle,
                        String joinTitle,
                        String version,
                        String callUri) {
    super(type, supportedTypes, title, callTitle, joinTitle, version);
    this.callUri = callUri;
  }

  /**
   * Gets the call URI.
   *
   * @return the call URI
   */
  public String getCallUri() {
    return callUri;
  }
  

}
