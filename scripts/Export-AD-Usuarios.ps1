# Export-AD-Usuarios.ps1 — Exporta usuarios del AD para GLPI-Move (formato v2).
# Columnas: Usuario;Nombre;Cuenta;UltimoCambio;Dias;Email;UltimoLogon
#   Dias = "No vence" | "Sin información" | "Debe cambiar clave" | nro de días restantes.
# Ejecutar en un equipo con RSAT / módulo ActiveDirectory y permiso de lectura.
# Salida: C:\Temp\Usuarios_AD_yyyy-MM-dd.csv (UTF8, separador ";").

Import-Module ActiveDirectory

$ahora = Get-Date
$ou = "OU=Agencia_Users,OU=Active_Users,OU=Users,OU=SICyT,DC=server,DC=giol"

$resultado = Get-ADUser -SearchBase $ou -SearchScope Subtree -Filter * `
    -Properties PasswordLastSet, PasswordNeverExpires, Enabled,
                msDS-UserPasswordExpiryTimeComputed, EmailAddress,
                lastLogonTimestamp |
ForEach-Object {

    $u = $_
    $expiracion = $u.'msDS-UserPasswordExpiryTimeComputed'

    if ($u.PasswordNeverExpires -or $expiracion -eq [Int64]::MaxValue) {
        $dias = "No vence"
    }
    elseif ($null -eq $expiracion) {
        $dias = "Sin información"
    }
    elseif ($expiracion -eq 0) {
        $dias = "Debe cambiar clave"
    }
    else {
        $vencimiento = [DateTime]::FromFileTime($expiracion)
        $dias = [math]::Floor(($vencimiento - $ahora).TotalDays)
    }

    $ultimoCambio = if ($u.PasswordLastSet) { $u.PasswordLastSet.ToString("dd/MM/yyyy HH:mm:ss") } else { $null }
    $ultimoLogon = if ($u.lastLogonTimestamp) { ([DateTime]::FromFileTime($u.lastLogonTimestamp)).ToString("dd/MM/yyyy HH:mm:ss") } else { $null }

    [PSCustomObject]@{
        Usuario      = $u.SamAccountName
        Nombre       = $u.Name
        Cuenta       = if ($u.Enabled) {
                            "HABILITADA"
                        } else {
                            "DESHABILITADA"
                        }
        UltimoCambio = $ultimoCambio
        Dias         = $dias
        Email        = $u.EmailAddress
        UltimoLogon  = $ultimoLogon
    }

}

$fecha = Get-Date -Format "yyyy-MM-dd"

$resultado | Export-Csv `
    -Path "C:\Temp\Usuarios_AD_$fecha.csv" `
    -NoTypeInformation `
    -Encoding UTF8 `
    -Delimiter ";"
